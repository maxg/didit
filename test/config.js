var should = require('should');
var temp = require('temp');

var config = require('../config');

var override = {
  student: {
    semester: 'su00',
    repos: temp.mkdirSync('test-student-repos-')
  },
  staff: {
    semester: 'summer00',
    repo: temp.mkdirSync('test-staff-repo-'),
    users: [ 'eve', 'frank' ]
  },
  web: {
    certDomain: 'example.com'
  },
  ldap: undefined,
  mail: {
    transport: undefined
  },
  build: {
    results: temp.mkdirSync('test-build-results-')
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
