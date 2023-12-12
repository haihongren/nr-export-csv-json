# Report Synthetics monitor, APM agent, Infra agent entity info 
> Retrieve entity info across all accounts with New Relic user key
- report Synthetics monitor entities and the secure credentials used by the monitor
- report APM app entities and agent version information
- report Infra host entities and agent version information


### Installation 
> Node.js is required as prerequisite, the scripts are tested with Node.js v18.18.0

    git clone git@github.com:haihongren/nr-export-csv-json.git
    cd nr-export-csv-json
    npm install

### Set env variable NR_USER_KEY and export data
    export NR_USER_KEY="YOUR NR USER KEY"
    node getSyntheticsInfo.js
    node getAPMAgentEnvInfo.js 
    node getInfraAgentEnvInfo.js    
    
###  Export Synthetics entity info
> - export Synthetics monitor entities using GraphQL with pagination support
> 
> - The script extracts $secure.<CREDENTIAL> data from the synthetics scripts using regex pattern.  
By updating the regex pattern in the script, user can extract virtually any data from synthetics scripts.  
For example,  to report all the modules used in the scripts, use [require\((.*)\) regex pattern.](https://github.com/haihongren/nr-export-csv-json/blob/9961a2068ff44fc72fa1d68a899ac931c506ad70/getSyntheticsInfo.js#L15)

    Usage: node getSyntheticsInfo.js [OPTIONS]
        Examples:
        node getSyntheticsInfo.js
        node getSyntheticsInfo.js -t csv
        node getSyntheticsInfo.js -t json

- GraphQL to retrieve Synthetics info
  - User could add additional attributes to the GraphQL query without issue (always test it to be sure)
  - If you update the GraphQL query, take note that `${cursor}` variable is added to `results(${cursor})`
```
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
```

### Export APM agent entity info
> export APM agent env information using GraphQL with pagination support

    Usage: node getAPMAgentEnvInfo.js [OPTIONS]
        Examples:
        node getAPMAgentEnvInfo.js
        node getAPMAgentEnvInfo.js -t csv
        node getAPMAgentEnvInfo.js -t json

- GraphQL to retrieve APM agent info
  - User could add additional attributes to the GraphQL query without issue (always test it to be sure)
  - If you update the GraphQL query, take note that ${cursor} variable is added to results(${cursor})
```
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
                  }
                }
                nextCursor
              }
            }
          }
        }
```
### Export Infra agent entity info 
> export Infra agent env information using GraphQL with pagination support

    Usage: node getInfraAgentEnvInfo.js [OPTIONS]
        Examples:
        node getInfraAgentEnvInfo.js
        node getInfraAgentEnvInfo.js -t csv
        node getInfraAgentEnvInfo.js -t json

- GraphQL to retrieve Infra agent info
  - User could add additional attributes to the GraphQL query without issue (always test it to be sure)
  - If you update the GraphQL query, take note that ${cursor} variable is added to results(${cursor})  
```
    {
        actor {
            user {
              name
            }
            entitySearch(
              queryBuilder: {domain: INFRA, type: HOST}
              options: {tagFilter: "agentVersion"}
            ) {
              query
              results(${cursor}) {
                entities {
                account {
                    name
                    id
                  }
                  ... on InfrastructureHostEntityOutline {
                    guid
                    name
                    tags {
                      key
                      values
                    }
                    lastReportingChangeAt                
                  }
                }
                nextCursor
              }
            }
          }
          }

```

