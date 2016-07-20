const async = require('async');
const fs = require('fs');
const http = require('http');
const https = require('https');

const config = require('./config');
const log = require('./logger').cat('web');

const decider = require('./decider');
decider.createServer(function() {
  log.info('decider started');
});

const web = require('./frontend');
const ssl = {
  key: fs.readFileSync('./config/ssl-private-key.pem'),
  cert: fs.readFileSync('./config/ssl-certificate.pem'),
  ca: [ fs.readFileSync('./config/ssl-ca.pem') ],
  requestCert: true
};
const webserver = https.createServer(ssl, web);
webserver.listen(config.web.port, function() {
  log.info('web started on HTTPS port ' + config.web.port);
});

if (config.web.redirect) {
  let redirect = require('./redirect');
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
