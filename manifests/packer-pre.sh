#!/bin/bash

#
# Packer pre-Puppet setup.
#

set -ex

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done

# Install Puppet
apt-get update
apt-get install -y puppet

# Create daemon user
adduser --system $APP

# Go to app directory & obtain application code
mkdir /var/$APP
cd /var/$APP
tar xf /tmp/$APP.tar
chown -R $ADMIN:$ADMIN /var/$APP

# Set permissions on sensitive directories
chown $APP:$ADMIN config log
chmod 770 config log

# Allow app to bind to well-known ports
apt-get install -y authbind
for port in 80 443; do
  touch /etc/authbind/byport/$port
  chown $APP /etc/authbind/byport/$port
  chmod u+x /etc/authbind/byport/$port
done

# Install AFS
echo "krb5-config    krb5-config/default_realm string CSAIL.MIT.EDU
      openafs-client openafs-client/thiscell   string csail.mit.edu
      openafs-client openafs-client/cachesize  string 50000" | debconf-set-selections
apt-get install -y krb5-user kstart openafs-client openafs-krb5
