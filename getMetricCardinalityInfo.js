let axios=require('axios')
let _ = require('lodash')
let converter = require('json-2-csv');

const NR_USER_KEY = process.env.NR_USER_KEY;
const CONCURRENT_REQUEST=25; 

if (!NR_USER_KEY) {
  console.error('Error: NR_USER_KEY not found in environment variables.');
  process.exit(1); // Exit with an error code
}


const NEWRELIC_DC = 'US' // datacenter for account - US or EU
const GRAPHQL_ENDPOINT =
    NEWRELIC_DC === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com'
const DEFAULT_TIMEOUT = 10000 // You can specify a timeout for each task

const genericServiceCall = async function (responseCodes, options, success) {
    options.timeout = options.timeout || DEFAULT_TIMEOUT; // add a timeout if not already specified

    const possibleResponseCodes = Array.isArray(responseCodes) ? responseCodes : [responseCodes];

    try { 
      let result= await axios({
        method: options.method,
        url: options.url,
        data: options.body,
        headers: options.headers
        });
        if(!possibleResponseCodes.includes(result.status)) {
          let errmsg=`Expected [${possibleResponseCodes}] response code but got '${result.status}' from url '${options.url}'`
          throw new Error(errmsg);
        } else {
          return success(result.data)
      }

    }catch(error){
    // console.error("An error occurred..:");
    throw error;
    }

}

async function getAccounts(NR_USER_KEY) {
  const graphQLQuery = `
  {
    actor {
      accounts {
        id
        name
      }
    }
  }
      `
  const options = {
      url: `https://${GRAPHQL_ENDPOINT}/graphql`,
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'API-Key': NR_USER_KEY,
      },
      body: JSON.stringify({ query: graphQLQuery }),
  }

  return genericServiceCall([200], options, (body) => {
    return body
})
}

async function getNRQLData(accountid) {
  const graphQLQuery = `
      {
        actor {
          nrql(
            accounts: ${accountid}
            query: "FROM Metric SELECT cardinality() SINCE today RAW "
          ) {
            results
          }
        }
      }      
      `
  const options = {
      url: `https://${GRAPHQL_ENDPOINT}/graphql`,
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'API-Key': NR_USER_KEY,
      },
      body: JSON.stringify({ query: graphQLQuery }),
  }

  return genericServiceCall([200], options, (body) => {
    return body
})
}

async function getAccountsMetricCardinalityInfo(accounts) {
    
    const processChunk = async (chunk) => {
        const promises = chunk.map(async (item) => {
            try {
                const nrqlResult = await getNRQLData(item.id);     
                item.cardinality = nrqlResult?.data?.actor?.nrql?.results[0]?.['cardinality.null']||{};  
            } catch (error) {
                console.error('Error:', error);
            }
        });

        // Use Promise.all to wait for all promises in the chunk to resolve
        await Promise.all(promises);
    };

    const chunkSize = CONCURRENT_REQUEST;

    for (let i = 0; i < accounts.length; i += chunkSize) {
        const chunk = accounts.slice(i, i + chunkSize);
        console.error("-> processing accounts:", "total accounts:",accounts.length,"chunksize:",chunkSize, "current chunk:",i )
        await processChunk(chunk);
    }
    return accounts;

  }


async function getMetricCardinalityInfo() {
      let accountsResult = await getAccounts(NR_USER_KEY)
      let  accounts = accountsResult?.data?.actor?.accounts||{};   
      const fetchResult = await getAccountsMetricCardinalityInfo(accounts);
      // Check for the presence of the -t argument and its value
      const indexOfTypeArg = process.argv.indexOf('-t');
      const typeArgValue = indexOfTypeArg !== -1 ? process.argv[indexOfTypeArg + 1] : 'csv';

      if (typeArgValue === 'json') {
        console.log(JSON.stringify(fetchResult, null, 2));
      } else {
        console.log(converter.json2csv(fetchResult,{expandNestedObjects: true,expandArrayObjects:true, unwindArrays: true}));
      } 
  }

  getMetricCardinalityInfo();

