let axios = require('axios')
let _ = require('lodash')
let converter = require('json-2-csv');

const CONCURRENT_REQUEST=25;
const NR_USER_KEY = process.env.NR_USER_KEY;
if (!NR_USER_KEY) {
  console.error('Error: NR_USER_KEY not found in environment variables.');
  process.exit(1); // Exit with an error code
}
const NEWRELIC_DC = 'US' // datacenter for account - US or EU
const GRAPHQL_ENDPOINT =
  NEWRELIC_DC === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com'
const DEFAULT_TIMEOUT = 5000

const genericServiceCall = async function (responseCodes, options, success) {
  !('timeout' in options) && (options.timeout = DEFAULT_TIMEOUT) //add a timeout if not already specified
  let possibleResponseCodes = responseCodes
  if (typeof responseCodes == 'number') {
    //convert to array if not supplied as array
    possibleResponseCodes = [responseCodes]
  }
  try {
    let result = await axios({
      method: options.method,
      url: options.url,
      data: options.body,
      headers: options.headers
    });
    return success(result.data)
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1)
  }
}

async function getGraphQLData(NR_USER_KEY, nextCursor) {
  let cursor = "cursor:null"
  if (nextCursor !== "") {
    cursor = `cursor: "${nextCursor}"`
  }
  const graphQLQuery = `
    {
        actor {
            user {
              name
            }
            entitySearch(queryBuilder: {domain: APM, type: APPLICATION }
            ) {
              query
              results(${cursor}) {
                entities {
                  account {
                    name
                    id
                  }
                  ... on ApmApplicationEntityOutline {
                    guid
                    name
                    runningAgentVersions {
                      maxVersion
                      minVersion
                    }
                    type
                    language
                    lastReportingChangeAt
                    reporting
                    settings {
                      apdexTarget
                      serverSideConfig
                    }
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

  let nerdGraphResult = await getGraphQLData(NR_USER_KEY, nextCursor)
  nextCursor && console.error(`more page... cursor-> ${nextCursor}`);
  const results = nerdGraphResult?.data?.actor?.entitySearch?.results?.entities ?? {};
  nextCursor = nerdGraphResult?.data?.actor?.entitySearch?.results?.nextCursor || "";
  attributes = [...attributes, ...results]

  if (nextCursor) {
    attributes = fetchAttribute(NR_USER_KEY, nextCursor, attributes)
  }

  return attributes

}

 
async function getAPMLicenseKey( scriptGUID) {

  const graphQLQuery = `
  {
    actor {
      entity(guid: "${scriptGUID}") {
        ... on ApmApplicationEntity {
          applicationInstancesV2 {
            applicationInstances {
              environmentAttributes(filter: {contains: "newrelic.license"}) {
                attribute
                value
              }
            }
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

async function populateAPMLicenseKey(fetchResult) {
    
  const filteredArray = fetchResult;

  const processChunk = async (chunk) => {
      const promises = chunk.map(async (item) => {
          try {
              const licenseKeyResult = await getAPMLicenseKey(item.guid);    
              const apmLicenseKey = licenseKeyResult?.data?.actor?.entity?.applicationInstancesV2?.applicationInstances[0]?.environmentAttributes[0]?.value || "";   
              item.apmLicenseKey = apmLicenseKey;
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
      console.error("processing scripts:", "total APM:",filteredArray.length,"chunksize:",chunkSize, "current chunk:",i )
      await processChunk(chunk);
  }
  return filteredArray;

}
// 
async function getAPMEnvData() {
  let attributes = []
  let cursor = ""
  let allAPMEntities = await fetchAttribute(NR_USER_KEY, cursor, attributes)
  const fetchResult = await populateAPMLicenseKey(allAPMEntities);
  

  // Check for the presence of the -t argument and its value
  const indexOfTypeArg = process.argv.indexOf('-t');
  const typeArgValue = indexOfTypeArg !== -1 ? process.argv[indexOfTypeArg + 1] : 'csv';

  if (typeArgValue === 'json') {
    console.log(JSON.stringify(fetchResult, null, 2));
  } else {
    console.log(converter.json2csv(fetchResult, { expandNestedObjects: true, expandArrayObjects: true, unwindArrays: true }));    
  }

}

getAPMEnvData()
