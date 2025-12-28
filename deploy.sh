#!/bin/bash
cd ~/vastu_backend

# Pull latest code
git pull origin master

# Build and restart docker container
docker-compose down
docker-compose up -d --build
