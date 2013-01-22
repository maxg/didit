# Update packages before installing
stage { 'pre': }
class { apt: stage => 'pre'; }
class apt {
  exec { 'apt-get update': command => '/usr/bin/apt-get update'; }
}
Exec['apt-get update'] -> Package <| |>

exec {
  'add-apt node':
    command => '/usr/bin/add-apt-repository ppa:chris-lea/node.js && /usr/bin/apt-get update',
    require => Package['python-software-properties'],
    unless => '/usr/bin/test -f /etc/apt/sources.list.d/chris-lea-node_js*.list';
}

package {
  [ 'vim', 'python-software-properties', 'git', 'openjdk-6-jdk', 'ant', 'eclipse-jdt' ]:
    ensure => 'installed';
  
  [ 'nodejs', 'npm' ]:
    ensure => 'installed',
    require => Exec['add-apt node'];
}

# Generate SSL certificate
exec {
  'ssl certificate':
    command => 'openssl genrsa -out ssl-private-key.pem 1024 && openssl req -new -key ssl-private-key.pem -config config/openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem',
    path => '/usr/bin',
    cwd => '/vagrant',
    creates => '/vagrant/ssl-certificate.pem';
  
  'ssl ca':
    command => 'wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem',
    path => '/usr/bin',
    cwd => '/vagrant',
    creates => '/vagrant/ssl-ca.pem';
}

# Set time zone
file {
  '/etc/timezone':
    content => "America/New_York\n";
}
exec {
  'reconfigure tzdata':
    command => '/usr/sbin/dpkg-reconfigure tzdata',
    subscribe => File['/etc/timezone'],
    require => File['/etc/timezone'],
    refreshonly => true;
}
