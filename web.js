var async = require('async');
var fs = require('fs');
var http = require('http');
var https = require('https');

var config = require('./config');
var log = require('./logger').cat('web');

var decider = require('./decider');
decider.createServer(function() {
  log.info('decider started');
});

var web = require('./frontend');
var ssl = {
  key: fs.readFileSync('./config/ssl-private-key.pem'),
  cert: fs.readFileSync('./config/ssl-certificate.pem'),
  ca: [ fs.readFileSync('./config/ssl-ca.pem') ],
  requestCert: true
};
var webserver = https.createServer(ssl, web);
webserver.listen(config.web.port, function() {
  log.info('web started on HTTPS port ' + config.web.port);
});

if (config.web.redirect) {
  var redirect = require('./redirect');
  http.createServer(redirect).listen(config.web.redirect, function() {
    log.info('redirect started on HTTP port ' + config.web.redirect);
  });
}

process.on('SIGTERM', function() {
  log.info('SIGTERM');
  async.parallel([
    decider.close,
    webserver.close.bind(webserver)
  ], function(err) {
    if (err) { log.error(err, 'error closing servers'); }
    process.exit();
  });
});
