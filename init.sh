#!/bin/bash

# Define variables
PROJECT_DIR="."  # Update this to your actual project directory path
DOMAIN="decentralize.ooo"
EMAIL="draeder@gmail.com"
NGINX_CONTAINER="nginx"

# Start Nginx and App using initial nginx.conf
echo "Starting Nginx and App services with initial configuration..."
docker-compose -f "$PROJECT_DIR/docker-compose.yml" up -d

# Wait for Nginx to be fully up and serving the ACME challenge directory
echo "Waiting for Nginx to be ready..."
sleep 10  # Adjust if necessary

# Obtain SSL certificates with Certbot
echo "Obtaining SSL certificates for $DOMAIN..."
docker run -it --rm \
    -v "$PROJECT_DIR/data/certbot/conf:/etc/letsencrypt" \
    -v "$PROJECT_DIR/data/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --domain "$DOMAIN"

# Check if SSL certificates were obtained successfully
if [ -f "$PROJECT_DIR/data/certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo "SSL certificates obtained successfully."

    # Reload Nginx to apply the SSL configuration
    echo "Reloading Nginx..."
    docker exec $NGINX_CONTAINER nginx -s reload

    # Create or update the renewal script
    RENEWAL_SCRIPT="$PROJECT_DIR/renew_ssl.sh"
    cat > $RENEWAL_SCRIPT << EOF
#!/bin/bash
docker run -it --rm -v "$PROJECT_DIR/data/certbot/conf:/etc/letsencrypt" -v "$PROJECT_DIR/data/certbot/www:/var/www/certbot" certbot/certbot renew --quiet && docker exec $NGINX_CONTAINER nginx -s reload
EOF

    chmod +x $RENEWAL_SCRIPT

    # Add a cron job for renewing SSL certificates
    (crontab -l 2>/dev/null; echo "0 */12 * * * /bin/bash $RENEWAL_SCRIPT >> /var/log/certbot_renew.log 2>&1") | crontab -
else
    echo "Failed to obtain SSL certificates."
fi
