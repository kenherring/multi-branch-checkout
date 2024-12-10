/**@type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: './tsconfig.json',
	},
	plugins: [
		'@typescript-eslint',
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		"plugin:promise/recommended",
	],
	rules: {
		'no-inner-declarations': 0,
		'semi': [2, "never"],
		"promise/catch-or-return": "warn",
		"promise/no-callback-in-promise": "off",
		"promise/always-return": [ "warn",  { "ignoreLastCallback": true } ],
		'@typescript-eslint/no-unused-vars': 0,
		'@typescript-eslint/no-explicit-any': 0,
		'@typescript-eslint/explicit-module-boundary-types': 0,
		'@typescript-eslint/no-non-null-assertion': 0,
		'@typescript-eslint/no-namespace': 0,
		'@typescript-eslint/no-floating-promises': [ 'error', { 'checkThenables': true } ],
		'@typescript-eslint/no-misused-promises': 'error',
	}

};
