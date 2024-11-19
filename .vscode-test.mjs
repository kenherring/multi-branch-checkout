import { defineConfig } from '@vscode/test-cli'
import { fileURLToPath } from 'url'
import * as path from 'path'

// https://github.com/microsoft/vscode-test-cli/issues/48
import { env } from 'process'
delete env['VSCODE_IPC_HOOK_CLI']
env['DONT_PROMPT_WSL_INSTALL'] = true

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('mocha').MochaOptions} */
const mochaOpts = {
    // ui: 'tdd',
    bail: process.env['CIRCLECI'] ?? true,
    timeout: 10000,
    require: [
        'mocha',
        'tsconfig-paths/register',
        '@swc-node/register',
    ],
}

if (process.env['npm_command']) {
    mochaOpts.reporter = 'mocha-multi-reporters'
    mochaOpts.reporterOptions = {
        reporterEnabled: [ 'json-stream', 'xunit', 'spec', 'mocha-reporter-sonarqube' ],
        xunitReporterOptions: {
            output: path.resolve(__dirname, 'artifacts', 'mocha_results_xunit.xml'),
        },
        mochaReporterSonarqubeReporterOptions: {
            filename: path.resolve(__dirname, 'artifacts', 'mocha_results_sonar.xml'),
        },
    }
}

const config = {
    /** @type {import('@vscode/test-cli').IDesktopTestConfiguration} */
    tests: [
        {
            files: [ "./test/**.test.ts" ],
            extensionDevelopmentPath: __dirname,
            launchArgs: [
                '--disable-crash-reporter',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--disable-gpu',
                '--disable-telemetry',
	            '--disable-updates',
                '--sync=off',
                '--no-sandbox',
                '--no-xshm',
            ],
            mocha: mochaOpts,
            workspaceFolder: './test_projects/proj1/'
        },
    ],
    /** @type {import('@vscode/test-cli').ICoverageConfiguration} */
    coverage: {
        reporter: [ 'text', 'lcovonly' ],
        output: path.resolve(__dirname, 'artifacts'),
        // excluding node modules gives poor coverage results
        // this can be fixed with --exclude-after-remap=true
        // but the test runner doesn't make that easy
        // exclude: [
        //     "**/node_modules/**",
        // ]
    }

}

const definedConfig = defineConfig(config)

// console.log('config=' + JSON.stringify(definedConfig, null, 2))

export default definedConfig
