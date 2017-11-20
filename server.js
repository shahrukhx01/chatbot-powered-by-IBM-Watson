var express = require("express");
var app = express();
var cfenv = require("cfenv");
var bodyParser = require('body-parser')
var Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk
var request = require("request");

var conversation = new Conversation({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
//https://login.ng.bluemix.net/UAALoginServerWAR/passcode
"username": 'd7a3e529-5234-42b6-80e5-d155285efb79',
"password": 'rLP7Ss3taKcG',
   url: 'https://gateway.watsonplatform.net/conversation/api',
  version_date: Conversation.VERSION_DATE_2017_04_21
});

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

var mydb;

/* Endpoint to greet and add a new visitor to database.
* Send a POST request to localhost:3000/api/visitors with body
* {
* 	"name": "Bob"
* }
*/
app.post("/api/visitors", function (request, response) {
  var userName = request.body.name;
  if(!mydb) {
    console.log("No database.");
    response.send("Hello " + userName + "!");
    return;
  }
  // insert the username as a document
  mydb.insert({ "name" : userName }, function(err, body, header) {
    if (err) {
      return console.log('[mydb.insert] ', err.message);
    }
    response.send("Hello " + userName + "! I added you to the database.");
  });
});

/**
 * Endpoint to get a JSON array of all the visitors in the database
 * REST API example:
 * <code>
 * GET http://localhost:3000/api/visitors
 * </code>
 *
 * Response:
 * [ "Bob", "Jane" ]
 * @return An array of all the visitor names
 */
app.get("/api/visitors", function (request, response) {
  var names = [];
  if(!mydb) {
    response.json(names);
    return;
  }

  mydb.list({ include_docs: true }, function(err, body) {
    if (!err) {
      body.rows.forEach(function(row) {
        if(row.doc.name)
          names.push(row.doc.name);
      });
      response.json(names);
    }
  });
});


// load local VCAP configuration  and service credentials
var vcapLocal;
try {
  vcapLocal = require('./vcap-local.json');
  console.log("Loaded local VCAP", vcapLocal);
} catch (e) { }

const appEnvOpts = vcapLocal ? { vcap: vcapLocal} : {}

const appEnv = cfenv.getAppEnv(appEnvOpts);

if (appEnv.services['cloudantNoSQLDB']) {
  // Load the Cloudant library.
  var Cloudant = require('cloudant');

  // Initialize database with credentials
  var cloudant = Cloudant(appEnv.services['cloudantNoSQLDB'][0].credentials);

  //database name
  var dbName = 'mydb';

  // Create a new "mydb" database.
  cloudant.db.create(dbName, function(err, data) {
    if(!err) //err if database doesn't already exists
      console.log("Created database: " + dbName);
  });

  // Specify the database we are going to use (mydb)...
  mydb = cloudant.db.use(dbName);
}



// Endpoint to be call from the client side
/*app.post('/api/message', */ function watsonConverse(req, res) {
	console.log('I am here on conversations');
  var workspace = process.env.WORKSPACE_ID || '8d549855-a97b-44c0-b799-3deeb5702d6a';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }


  console.log(req.body);
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };
return payload;

}


//receives requests from clients and processes the request and then forwards it to appropriate route
app.post('/api/client_request', function(req, res) {
	console.log('etisalat request')
  console.log(req.body);
  var request = {};
  var response = {};
  request.body =  req.body.conversation_input;

if(req.body.speechEnabled == false){
//prepare input payload for Watson conversation
  var payload = watsonConverse(request,response);

// Send the input to the conversation service
  conversation.message(payload, function(err, data) {
  if (err) {
    return res.status(err.code || 500).json(err);
  }
  response.transcribedSpeech = "";
  response.speechEnabled = req.body.speechEnabled;
  response.conversation_response = updateMessage(payload, data);
  if(response.conversation_response.output.cardType!= undefined)
  response = buildQuery(response);
  return res.json(response);
});

}
else{
  return res.json(["watson speech to text is under development..."]);
}

});

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(input, response) {
  var responseText = null;
  if (!response.output) {
    response.output = {};
  } else {
    return response;
  }
  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  response.output.text = responseText;
  return response;
}


function buildQuery(response){
var query;
var queries = [];
var KPIs =  response.conversation_response.context.KPI;
for(KPI in KPIs){
  query = "";
console.log(KPIs[KPI]);
switch (KPIs[KPI]) {

    case "CSSR":
        query = "select 100*(ERI_UDC1110094_NUM1/ERI_UDC1110094_DEN1)*(ERI_UDC1110094_NUM2/ERI_UDC1110094_DEN2)*(ERI_UDC1110094_NUM3/ERI_UDC1110094_DEN3) from dash15201.WTN_ERIMA_PS_4G_EUTCELL_DSM_V where ERI_UDC1110094_DEN1 <> 0 and ERI_UDC1110094_DEN2 <> 0 and ERI_UDC1110094_DEN3 <> 0";
        break;
    case "RRCSR":
    query = "select 100*ERI_UDC1110093_NUM/ERI_UDC1110093_DEN from dash15201.WTN_ERIMA_PS_4G_EUTCELL_DSM_V where ERI_UDC1110093_DEN <> 0";
        break;
    case "ERAB":
    query = "select 100*ERI_UDC1110108_NUM/ERI_UDC1110108_DEN from dash15201.WTN_ERIMA_PS_4G_EUTCELL_DSM_V where ERI_UDC1110108_DEN <> 0";
        break;
    case "HOExecution":
      query = "select 100*ERI_UDC1110101_NUM/ERI_UDC1110101_DEN from dash15201.WTN_ERIMA_PS_4G_EUTCELL_DSM_V where ERI_UDC1110101_DEN <> 0";
        break;
    case "DLThroughput":
    query = "select ERI_UDC1110105_NUM/ERI_UDC1110105_DEN from dash15201.WTN_ERIMA_PS_4G_EUTCELL_DSM_V where ERI_UDC1110105_DEN <> 0";
        break;
}
var kpi = KPIs[KPI];
var myObj = {};
myObj[kpi] = query;
queries.push(myObj);
/*
//selecting time filter
if(response.conversation_response.entities[1].filter["sys-date"] != undefined){
  query = query + " and sys-date="+ response.conversation_response.entities[1].filter["sys-date"];
  console.log("here");
  }
else if(response.conversation_response.entities[1].filter.Date != undefined){
  query = query + " and days="+ response.conversation_response.entities[1].filter.Date;
  }
else{
    query = query + " and hours="+ response.conversation_response.entities[1].filter.Hours;
  }

//selecting location filter
if(response.conversation_response.entities[1].filter.General.best != undefined &&
  response.conversation_response.entities[1].filter.General.worst != undefined &&
  response.conversation_response.entities[1].filter.General.low !=undefined ){
  query = query + " and (location="+ response.conversation_response.entities[1].filter.General.best +
  " or location="+response.conversation_response.entities[1].filter.General.worst +" )";
  }
else if(response.conversation_response.entities[1].filter.General.Site != undefined){
  query = query + " and location="+ response.conversation_response.entities[1].filter.General.Site;
  }
else if(response.conversation_response.entities[1].filter.General.Site != undefined){
    query = query + " and site="+ response.conversation_response.entities[1].filter.General.Site;
  }
  else if(response.conversation_response.entities[1].filter.General.Cluster != undefined){
      query = query + " and cluster="+ response.conversation_response.entities[1].filter.General.Cluster;
    }
    else if(response.conversation_response.entities[1].filter.General.Region != undefined){
        query = query + " and region="+ response.conversation_response.entities[1].filter.General.Region;
      }
*/
}

 response.query = queries;
 return response;


}


//serve static file (index.html, images, css)
app.use(express.static(__dirname + '/views'));





var port = process.env.PORT || 3000
app.listen(port, function() {
    console.log("To view your app, open this link in your browser: http://localhost:" + port);
});
