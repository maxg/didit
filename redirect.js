var https = require('https');
var express = require('express');

var config = require('./config')
var log = require('./logger').cat('redirect');

var app = express();

var port = config.web.port == 443 ? '' : ':' + config.web.port;

app.get('*', function(req, res, next) {
  log.info('redirecting', req.path);
  res.redirect('https://' + req.host + port + req.path);
});

module.exports = app;
