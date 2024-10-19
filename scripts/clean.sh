#!/bin/bash

initialize () {
	  echo "Cleaning up the project..."
}

clean () {
	rm -rf out node_modules
}

########## MAIN BLOCK ##########
initialize "$@"
clean
