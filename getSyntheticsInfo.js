let axios=require('axios')
let _ = require('lodash')
let converter = require('json-2-csv');

const NR_USER_KEY = process.env.NR_USER_KEY;
const CONCURRENT_REQUEST=25;

if (!NR_USER_KEY) {
  console.error('Error: NR_USER_KEY not found in environment variables.');
  process.exit(1); // Exit with an error code
}

// Define the regex pattern to extract from the script, 
const REGEXPATTERN = /\$secure\.(\w+)/gi; //find $secure credentials
// const REGEXPATTERN = /require\((.*)\)/gi; // other examples, find require modules

const NEWRELIC_DC = 'US' // datacenter for account - US or EU
const GRAPHQL_ENDPOINT =
    NEWRELIC_DC === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com'
const DEFAULT_TIMEOUT = 10000 // You can specify a timeout for each task

const genericServiceCall = async function (responseCodes, options, success) {
    !('timeout' in options) && (options.timeout = DEFAULT_TIMEOUT) //add a timeout if not already specified
    let possibleResponseCodes = responseCodes
  if (typeof responseCodes == 'number') {
        //convert to array if not supplied as array
        possibleResponseCodes = [responseCodes]
    }
    try { 
      let result= await axios({
        method: options.method,
        url: options.url,
        data: options.body,
        headers: options.headers
        });
        return success(result.data)
    }catch(error){
    console.error("An error occurred:", error.message);
    process.exit(1)
    }

}

async function getAttributeData(NR_USER_KEY, nextCursor) {
    let cursor="cursor:null"
    if (nextCursor!=="") {
        cursor=`cursor: "${nextCursor}"`
    }    
    // console.log("query cursor",cursor)  
    const graphQLQuery = `
    {
      actor {
        entitySearch(queryBuilder: {domain: SYNTH}) {
          results(${cursor}) {
            entities {
              ... on SyntheticMonitorEntityOutline {
                guid
                name
                monitorType
                reporting
                accountId
                monitorSummary {
                  status
                }
                account {
                  name
                }
              }
              reporting
              type
              ... on SecureCredentialEntityOutline {
                guid
                name
              }
            }
            nextCursor
          }
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


const fetchAttribute = async (NR_USER_KEY, nextCursor, attributes) => {
    let nerdGraphResult = await getAttributeData(NR_USER_KEY, nextCursor)
    const results = ((((((nerdGraphResult || {}).data || {}).actor || {}).entitySearch || {}).results ||{}).entities ||{})
    nextCursor && console.error(`more page... cursor-> ${nextCursor}`);    
    nextCursor = ((((((nerdGraphResult || {}).data || {}).actor || {}).entitySearch || {}).results ||{})).nextCursor||""
    attributes = [...attributes, ...results]
    if (nextCursor) {
        attributes = fetchAttribute(NR_USER_KEY, nextCursor, attributes)
    }

    return attributes

}


async function getScript(accountid, scriptGUID) {

    const graphQLQuery = `
        {
            actor {
            account(id: ${accountid}) {
                synthetics {
                script(
                    monitorGuid: "${scriptGUID}"
                ) {
                    text
                }
                }
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

function findSecureCredential(regexPattern, text) {

    // Initialize an empty string to store credentials
    let credentials = '';
  
    // Use a loop to find all matches in the text
    let match;
    let firstitem=true;
    while ((match = regexPattern.exec(text)) !== null) {

      // The matched group is in match[1]
      let secureValue = match[1];
      secureValue =secureValue.replace(/"/g, "'");
      // Append the secure value to the credentials string
      if (!firstitem) {
        secureValue = ','+secureValue; 
      }
      credentials += secureValue;

      regexPattern.lastIndex = match.index + 1;
      firstitem=false
    }
  
    // Return the final credentials string
    return credentials;
  }
  

async function getAttributes() {
    let attributes = []
    let cursor = ""
    let fetchResult = await fetchAttribute(NR_USER_KEY, cursor, attributes)
    return fetchResult
}

async function populateSecureCredentials(fetchResult) {
    
    const filteredArray = fetchResult
                            .filter(item => item.type !== 'SECURE_CRED' && item.type !== 'PRIVATE_LOCATION' && item.type !=='MONITOR_DOWNTIME')
                            .filter(item => item.monitorType !== 'SIMPLE' && item.monitorType !== 'BROWSER' && item.monitorType !== 'BROKEN_LINKS'  );

      const remainingArray =  fetchResult
      .filter(item => item.type !== 'SECURE_CRED' && item.type !== 'PRIVATE_LOCATION' && item.type !=='MONITOR_DOWNTIME')
      .filter(item => item.monitorType == 'SIMPLE' || item.monitorType == 'BROWSER' || item.monitorType == 'BROKEN_LINKS'  );

      remainingArray.map(item=>{
        item.credentials = "N/A";
      })

 
    const processChunk = async (chunk) => {
        const promises = chunk.map(async (item) => {
            try {
                const scriptResult = await getScript(item.accountId, item.guid);
                const text = scriptResult?.data?.actor?.account?.synthetics?.script?.text || {};           
                const secureCredential = findSecureCredential(REGEXPATTERN,text);

                // Add "credential" key to the item with the result
                item.credentials = secureCredential;
            } catch (error) {
                // Handle errors from getScript()
                console.error('Error:', error);
            }
        });

        // Use Promise.all to wait for all promises in the chunk to resolve
        await Promise.all(promises);
    };

    // Split the array into chunks of 10 promises
    const chunkSize = CONCURRENT_REQUEST;
    for (let i = 0; i < filteredArray.length; i += chunkSize) {
        const chunk = filteredArray.slice(i, i + chunkSize);
        console.error("total monitors :", remainingArray.length+filteredArray.length,"-> processing scripts:", "total script:",filteredArray.length,"chunksize:",chunkSize, "current chunk:",i )
        await processChunk(chunk);
    }
    return [...filteredArray,...remainingArray];

  }


async function getSyntheticsData() {
      const allSyntheticsScripts = await getAttributes();
      const fetchResult = await populateSecureCredentials(allSyntheticsScripts);


      // Check for the presence of the -t argument and its value
      const indexOfTypeArg = process.argv.indexOf('-t');
      const typeArgValue = indexOfTypeArg !== -1 ? process.argv[indexOfTypeArg + 1] : 'csv';

      if (typeArgValue === 'json') {
        console.log(JSON.stringify(fetchResult, null, 2));
      } else {
        console.log(converter.json2csv(fetchResult,{expandNestedObjects: true,expandArrayObjects:true}));
      } 
  }
getSyntheticsData();

