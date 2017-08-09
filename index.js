// CALL THE PACKAGES --------------------
var path = require('path');
global.appRoot = path.resolve(__dirname);
global.io = {};
var scribe = require('scribe-js')();
var express = require('express'); // call express
var config = require('./config');
var compression = require('compression');
var helmet = require('helmet');
var favicon = require('serve-favicon'); // set favicon
var bodyParser = require('body-parser');
var colors = require('colors');
var logo = require('./printLogo');
var cons = require('consolidate');
var _ = require('lodash');
var nconf = require('nconf');
var ngrok = require('ngrok');
var auth = require('http-auth'); // @see https://github.com/gevorg/http-auth
// use scribe.js for logging
var console = require('./app/models/consoleService')();

var app = express(); // define our app using express

// var admin = require('firebase-admin');
//
// var serviceAccount = require('./serviceAccountKey.json');
//
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: 'https://achievibit-auth.firebaseio.com'
// });

// var defaultAuth = admin.auth();
nconf.argv().env();
var port = nconf.get('port');
var url = nconf.get('databaseUrl');
var stealth = nconf.get('stealth');
var dbLibrary = nconf.get('testDB') ? 'monkey-js' : 'monk';
var monk = require(dbLibrary);
var db = monk(url);

if (!port) {
  port = config.port;
}

var eventManager = require('./eventManager');

var basicAuth = auth.basic({
  realm: 'achievibit ScribeJS WebPanel'
}, function (username, password, callback) {
  var logsUsername = nconf.get('logsUsername') ?
    nconf.get('logsUsername') + '' : '';

  var logsPassword = nconf.get('logsPassword') ?
    nconf.get('logsPassword') + '' : '';

  callback(username === logsUsername && password === logsPassword);
}
);

var publicFolder = __dirname + '/public';

var token = nconf.get('ngrokToken');

// assign the swig engine to .html files
app.engine('html', cons.swig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// hook helmet to our express app. This adds some protection to each
// communication with the server.
// read more at https://github.com/helmetjs/helmet
app.use(helmet());

// compress all requests
app.use(compression({
  threshold: 0
}));

colors.enabled = true; //enable colors even through piping.

// create application/json parser
var jsonParser = bodyParser.json();

/** ===========
 *   = LOGGING =
 *   = =========
 *   set up logging framework in the app
 *   when NODE_ENV is set to development (like in gulp watch),
 *   don't log at all (TODO: make an exception for basic stuff
 *   like: listening on port: XXXX)
 */
// app.use(scribe.express.logger());
if (nconf.get('logsUsername')) {
  app.use('/logs', auth.connect(basicAuth), scribe.webPanel());
} else {
  app.use('/logs', scribe.webPanel());
}


/** ================
 *   = STATIC FILES =
 *   = ==============
 *   set static files location used for requests that our frontend will make
 */
app.use(express.static(publicFolder));

/** =================
 *   = SERVE FAVICON =
 *   = ===============
 *   serve the favicon.ico so that modern browsers will show a "tab" and
 *   favorites icon
 */
app.use(favicon(path.join(__dirname,
  'public', 'assets', 'images', 'favicon.ico')));

/** ==================
 *   = ROUTES FOR API =
 *   = ================
 *   set the routes for our server's API
 */
var apiRoutes = require('./app/routes/api')(app, express);
app.use('/', jsonParser, apiRoutes);

// app.get('/download/extension', function(req, res) {
//   var file = __dirname + '/public/achievibit-chrome-extension.crx';
//   res.download(file);
// });

/** =============
 *   = FRONT-END =
 *   = ===========
 *   Main 'catch-all' route to send users to frontend
 */
/* NOTE(thatkookooguy): has to be registered after API ROUTES */
app.get('/', function(req, res) {
  var users = db.get('users');
  var repos = db.get('repos');
  users.find({}).then(function(allUsers) {
    repos.find({}).then(function(allRepos) {
      var allOrganizations = _.remove(allUsers, 'organization');

      res.render('index' , {
        users: allUsers,
        organizations: allOrganizations,
        repos: allRepos
      });
    }, function(error) {
      console.error('problem getting repos', error);
    });
  }, function(error) {
    console.error('problem getting users', error);
  });
  //res.sendFile(path.join(publicFolder + '/index.html'));
});

/** ==========
 *   = SERVER =
 *   = ========
 */
var server = app.listen(port, function() {
  if (!stealth) {
    logo();
  }
  console.info('Server listening at port ' +
    colors.bgBlue.white.bold(' ' + port + ' '));
});

global.io = require('socket.io').listen(server);

// Emit welcome message on connection
global.io.on('connection', function(socket) {
  var username = socket &&
    socket.handshake &&
    socket.handshake.query &&
    socket.handshake.query.githubUsername;

  if (username) {
    console.log('USER CONNECTED: ' + username);
  } else {
    console.log('ANONYMOUS USER CONNECTED!');
  }
});


if (token) {
  ngrok.authtoken(token, function(err) {
    if (err) {
      console.error(err);
    }
  });
  ngrok.connect(port, function (err, url) {
    if (err) {
      console.error(err);
    } else {
      console.info([
        colors.cyan('ngrok'),
        ' - serving your site from ',
        colors.yellow(url)
      ].join(''));
    }
  });
}
