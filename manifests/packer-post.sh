#!/bin/bash

#
# Packer post-Puppet provisioning.
#

set -ex

cd /var/$APP

# Install Node.js packages
npm install

# Set permissions on sensitive files
chown $APP:$ADMIN config/ssl-*.pem
chmod 660 config/ssl-*.pem
