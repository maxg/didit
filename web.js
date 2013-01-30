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
  key: fs.readFileSync('./ssl-private-key.pem'),
  cert: fs.readFileSync('./ssl-certificate.pem'),
  ca: [ fs.readFileSync('./ssl-ca.pem') ],
  requestCert: true
};
https.createServer(ssl, web).listen(config.web.port, function() {
  log.info('web started on HTTPS port ' + config.web.port);
});

if (config.web.redirect) {
  var redirect = require('./redirect');
  http.createServer(redirect).listen(config.web.redirect, function() {
    log.info('redirect started on HTTP port ' + config.web.redirect);
  });
}
