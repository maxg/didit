var async = require('async');
var express = require('express');
var fs = require('fs');
var http = require('http');
var https = require('https');
var path = require('path');

var config = require('./config');
var logger = require('./logger');
var log = logger.cat('whoops');

var app = express();

app.set('view engine', 'jade');

app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(logger.express());

app.get('*', function(req, res) {
  res.render('whoops');
});

app.post('*', function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Sorry, Didit server is down for maintenance\n');
});

var ssl = {
  key: fs.readFileSync('./ssl-private-key.pem'),
  cert: fs.readFileSync('./ssl-certificate.pem'),
  ca: [ fs.readFileSync('./ssl-ca.pem') ]
};
https.createServer(ssl, app).listen(config.web.port, function() {
  log.info('whoops started on HTTPS port ' + config.web.port);
});

if (config.web.redirect) {
  var redirect = require('./redirect');
  http.createServer(redirect).listen(config.web.redirect, function() {
    log.info('redirect started on HTTP port ' + config.web.redirect);
  });
}