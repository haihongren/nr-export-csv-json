// main.js

function printHelp() {
  console.log(`
==> Install dependency packages
    npm install

==> Set env variable NR_USER_KEY 
    export NR_USER_KEY="YOUR NR USER KEY"

==> Export APM agent entity info==== 

    Usage: node getAPMAgentEnvInfo.js [OPTIONS]
        Examples:
        node getAPMAgentEnvInfo.js
        node getAPMAgentEnvInfo.js -t csv
        node getAPMAgentEnvInfo.js -t json

==> Export Infra agent entity info==== 

    Usage: node getInfraAgentEnvInfo.js [OPTIONS]
        Examples:
        node getInfraAgentEnvInfo.js
        node getInfraAgentEnvInfo.js -t csv
        node getInfraAgentEnvInfo.js -t json

==>  Export Synthetics entity info==== 

    Usage: node getSyntheticsInfo.js [OPTIONS]
        Examples:
        node getSyntheticsInfo.js
        node getSyntheticsInfo.js -t csv
        node getSyntheticsInfo.js -t json

`);
}
printHelp();
