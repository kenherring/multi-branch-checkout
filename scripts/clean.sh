#!/bin/bash

initialize () {
	  echo "Cleaning up the project..."
}

clean () {
	rm -rf .vscode-test artifacts coverage dist out node_modules
	rm -rf test_projects/proj1/*
}

########## MAIN BLOCK ##########
initialize "$@"
clean
