const os = require('os');
const should = require('should');
const temp = require('temp').track();

const config = require('../src/config');

const override = {
  semester: 'su00',
  student: {
    repos: temp.mkdirSync('test-student-repos-'),
    kinds: undefined,
    acl: 'test'
  },
  staff: {
    repo: temp.mkdirSync('test-staff-repo-'),
    base: 'summer00',
    users: [ 'eve', 'frank' ]
  },
  web: {
    certDomain: 'example.com'
  },
  ldap: undefined,
  mail: {
    transport: 'PICKUP',
    directory: temp.mkdirSync('test-mail-'),
    sender: process.env.USER + '@' + os.hostname(),
    owner: 'nobody@example.com',
    domain: 'example.com'
  },
  build: {
    results: temp.mkdirSync('test-build-results-')
  },
  log: {
    mail: undefined
  }
};

function merge(source, destination, parents) {
  parents = parents || '';
  Object.keys(source).forEach(function(key) {
    if (destination[key] === undefined) {
      destination[key] = source[key];
    } else if (destination[key] instanceof Object) {
      merge(source[key], destination[key], parents + key + '.');
    } else {
      throw new Error('Cannot override configuration: ' + parents + key);
    }
  });
}
merge(override, config);
