const async = require('async');
const ldap = require('ldapjs');

const config = require('./config');
const log = require('./logger').cat('rolodex');

const rolodex = {};

// look up a user in LDAP by username
exports.lookup = function(username, callback) {
  if (rolodex.hasOwnProperty(username)) {
    return callback(null, rolodex[username]);
  }
  if ( ! config.ldap) {
    return callback(null, rolodex[username] = null);
  }
  ldapsearch(config.ldap.base, {
    scope: 'sub',
    filter: new ldap.EqualityFilter({ attribute:'uid', value: username }),
    attributes: [ 'givenName', 'surname' ]
  }, function(err, res) {
    if (err) {
      log.error({ err, username }, 'LDAP client error');
      return callback(err);
    }
    let fullname = null;
    res.once('searchEntry', function(entry) {
      if (entry && entry.object && entry.object.givenName) {
        fullname = entry.object.givenName + ' ' + entry.object.surname;
      }
    });
    res.on('error', function(err) {
      log.warn({ err, username }, 'LDAP search error');
    });
    res.once('end', function(result) {
      callback(null, rolodex[username] = fullname);
    });
  });
};

let client = null;
let active = 0;

function getClient(callback) {
  if ( ! client) {
    log.info('connecting to LDAP');
    client = ldap.createClient({ url: config.ldap.url, timeout: 1500 });
  }
  active++;
  callback(null, client, function() {
    if (--active == 0) {
      log.info('disconnecting from LDAP');
      client.unbind(function(err) { if (err) { log.error(err); } });
      client = null;
    }
  });
}

function ldapsearch(base, options, callback) {
  log.info({ base, options: JSON.stringify(options) }, 'ldapsearch');
  getClient(function(err, client, done) {
    client.search(base, options, function(err, res) {
      callback(err, res);
      if (err) { done(); } else { res.on('end', done); }
    });
  });
}

if (require.main === module) {
  async.each(process.argv.slice(2), function(username, next) {
    exports.lookup(username, function(err, name) {
      log.info({ err, username, fullname: name }, 'user');
      next();
    });
  }, function(err) {
    log.info({ err }, 'done');
  });
}
