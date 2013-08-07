# Update packages before installing
exec { 'apt-get update': command => '/usr/bin/apt-get update'; }
Exec['apt-get update'] -> Package <| |>

exec {
  'add-apt node':
    command => 'add-apt-repository ppa:chris-lea/node.js && apt-get update',
    path => [ '/usr/bin', '/bin' ],
    require => Package['python-software-properties'],
    unless => '/usr/bin/test -f /etc/apt/sources.list.d/chris-lea-node_js*.list';
}

package {
  [ 'vim', 'python-software-properties',
    'unzip', 'make', 'g++', 'libxml2-dev',
    'git', 'openjdk-6-jdk', 'ant', 'eclipse-jdt' ]:
    ensure => 'installed';
  
  [ 'nodejs' ]:
    ensure => 'installed',
    require => Exec['add-apt node'];
}

exec {
  'get bootstrap':
    command => 'wget -q --post-data=`node -pe "require(\'../../config/bootstrap.js\')"` http://bootstrap.herokuapp.com -O bootstrap.zip && unzip bootstrap.zip && rm bootstrap.zip',
    path => [ '/bin', '/usr/bin' ],
    cwd => '/vagrant/public/bootstrap',
    require => Package['nodejs', 'unzip'],
    creates => '/vagrant/public/bootstrap/css/bootstrap.min.css';
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
