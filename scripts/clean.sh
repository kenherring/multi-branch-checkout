#!/bin/bash

initialize () {
	  echo "Cleaning up the project..."
}

clean () {
	rm -r out node_modules
}

########## MAIN BLOCK ##########
initialize "$@"
clean
