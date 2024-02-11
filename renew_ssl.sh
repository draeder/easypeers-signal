#!/bin/bash

# Define variables
PROJECT_DIR="." # Absolute path required for cron
DOMAIN="decentralize.ooo"
NGINX_CONTAINER="nginx"

# Attempt to renew the SSL certificates
echo "Attempting to renew SSL certificates for $DOMAIN..."
docker run -it --rm \
    -v "$PROJECT_DIR/data/certbot/conf:/etc/letsencrypt" \
    -v "$PROJECT_DIR/data/certbot/www:/var/www/certbot" \
    certbot/certbot renew --quiet

# Check if the renewal was successful and if so, reload Nginx
RENEWAL_RESULT=$?

if [ $RENEWAL_RESULT -eq 0 ]; then
    echo "SSL certificates renewed successfully. Reloading Nginx..."
    docker exec $NGINX_CONTAINER nginx -s reload
else
    echo "No renewal needed at this time."
fi
