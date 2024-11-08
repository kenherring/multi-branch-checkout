#!/bin/bash

initialize () {
	  echo "Cleaning up the project..."
}

clean () {
	rm -rf .vscode-test artifacts coverage dist out node_modules
}

########## MAIN BLOCK ##########
initialize "$@"
clean
