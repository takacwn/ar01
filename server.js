/**
 * This is the main server script that provides the API endpoints
 * The script uses the database helper in /src
 * The endpoints retrieve, update, and return data to the page handlebars files
 *
 * The API returns the front-end UI handlebars pages, or
 * Raw json if the client requests it with a query parameter ?raw=json
 */

/* Utilities we need

const fs = require("fs");

 「fs」は、Node.jsでファイルを操作するための公式モジュールとして提供されています。
 ファイルを新規作成したり、読み込み・書き込みから追記・削除まで、
 一般的に必要な機能はあらかじめ用意されています。
 そのため、Node.jsが使える環境さえあればすぐにでも実行することが可能です。
 

pathモジュールは、ファイルパスからディレクトリ名を取得したり、ファイル名だけを取得したりするような文字列としてのパスの操作ができます。
Node.jsに標準で入っているので下記のようにrequireで読み込めます。

require('path')

読み込んだ後は、pathを代入した変数からpathのメソッドを呼び出すことでパスの文字列を操作するいろいろな処理を実行できます。

**/
const fs = require("fs");
const path = require("path");

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  // Fastifyフレームワークをインポートし、logger オプションを false に設定してインスタンス化しています。logger オプションを true に設定すると、Fastifyが詳細なログを出力します。
  logger: false,
});

// Setup our static files
// Fastifyに @fastify/static プラグインを登録しています。このプラグインは、静的ファイル（HTML、CSS、JavaScriptなど）を提供するために使用されます。
// root オプションは、静的ファイルのルートディレクトリを指定します。ここでは、__dirname と "public" を結合して、実行ファイルのディレクトリにある "public" フォルダが指定されています。prefix オプションは、静的ファイルのURLプレフィックスを指定します。デフォルトでは / が指定されています。
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
});

// Formbody lets us parse incoming forms
// Fastifyに @fastify/formbody プラグインを登録しています。このプラグインは、受信したフォームデータをパースするために使用されます。フォームデータを簡単にアクセスするための機能を提供します。
fastify.register(require("@fastify/formbody"));

// View is a templating manager for fastify
// Fastifyに @fastify/view プラグインを登録しています。このプラグインは、テンプレートエンジンを使用してビューをレンダリングするために使用されます。ここでは、Handlebarsテンプレートエンジンを指定しています。engine オプションには、使用するテンプレートエンジンを指定します。Handlebarsを使用する場合、handlebars を指定し、require("handlebars") でHandlebarsモジュールをインポートしています。
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});

// Load and parse SEO data
// seo.url の値が "glitch-default" である場合、URLを変更します。
// この条件は特定の環境（おそらくGlitchなどのホスティングプラットフォーム）において、
// デフォルトのURLを使用しないようにするためのものです。process.env.PROJECT_DOMAIN は環境変数からプロジェクトのドメインを取得し、
// それを元に新しいURLを生成します。生成されたURLは seo.url に格納されます
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

// We use a module for handling database operations in /src
const data = require("./src/data.json");
const db = require("./src/" + data.database);

/**
 * Home route for the app
 *
 * Return the poll options from the database helper script
 * The home route may be called on remix in which case the db needs setup
 *
 * Client can request raw data using a query parameter
 */
fastify.get("/", async (request, reply) => {
  /* 
  Params is the data we pass to the client
  - SEO values for front-end UI but not for raw data
  */
  let params = request.query.raw ? {} : { seo: seo };
  
  // Get the available choices from the database
  const options = await db.getOptions();
  if (options) {
    params.optionNames = options.map((choice) => choice.language);
    params.optionCounts = options.map((choice) => choice.picks);
  }
  // Let the user know if there was a db error
  else params.error = data.errorMessage;

  // Check in case the data is empty or not setup yet
  if (options && params.optionNames.length < 1)
    params.setup = data.setupMessage;

  // ADD PARAMS FROM TODO HERE

  // Send the page options or raw JSON data if the client requested it
  return request.query.raw
    ? reply.send(params)
    : reply.view("/src/pages/index.hbs", params);
});

/**
 * Post route to process user vote
 *
 * Retrieve vote from body data
 * Send vote to database helper
 * Return updated list of votes
 */
fastify.post("/", async (request, reply) => {
  // We only send seo if the client is requesting the front-end ui
  let params = request.query.raw ? {} : { seo: seo };

  // Flag to indicate we want to show the poll results instead of the poll form
  params.results = true;
  let options;

  // We have a vote - send to the db helper to process and return results
  if (request.body.language) {
    options = await db.processVote(request.body.language);
    if (options) {
      // We send the choices and numbers in parallel arrays
      params.optionNames = options.map((choice) => choice.language);
      params.optionCounts = options.map((choice) => choice.picks);
    }
  }
  params.error = options ? null : data.errorMessage;

  // Return the info to the client
  return request.query.raw
    ? reply.send(params)
    : reply.view("/src/pages/index.hbs", params);
});

/**
 * Admin endpoint returns log of votes
 *
 * Send raw json or the admin handlebars page
 */
fastify.get("/logs", async (request, reply) => {
  // リクエストクエリの `raw` パラメータが存在するかどうかによって、`params` オブジェクトの初期化を切り替える
  let params = request.query.raw ? {} : { seo: seo };

  // データベースからログ履歴を取得し、`params.optionHistory` に代入する
  params.optionHistory = await db.getLogs();

  // `params.optionHistory` が存在するかどうかによって、エラーメッセージを設定する
  params.error = params.optionHistory ? null : data.errorMessage;

  // ログリストを返す
  return request.query.raw
    ? reply.send(params)  // rawパラメータが存在する場合は、paramsをそのまま送信する
    : reply.view("/src/pages/admin.hbs", params);  // rawパラメータが存在しない場合は、admin.hbsテンプレートを使用してparamsをレンダリングして返す
});




//*******************Fastify のルーティング その１
fastify.route({
  method: 'GET',
  url: '/hello',
  handler: function (request, reply) {
    reply.send('Hello, World!')
  }
})

//*******************Fastify のルーティング その２
fastify.get("/hello2", {
  schema: {
    querystring: {
      name: { type: "string" },
      excitement: { type: "integer" },
    },
    response: {
      200: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
  },
  handler: function (request, reply) {
    reply.send({ message: "Hello, World2!" });
  },
});

// ✅✅✅✅✅✅✅動的 URL 宣言  
// Fastify では、URL パスに動的な部分がある場合、それを変数として扱うことができます。たとえば、/users/:userId という URL パスがある場合、:userId の部分を変数として扱うことができます。このような変数は、params オブジェクトを介してアクセスできます。
fastify.get('/users/:userId', async (request, reply) => {
  const userId = request.params.userId;
  reply.send({ message: `User ID is ${userId}` });
});


// ハンドラー関数 
// ルーティングの設定では、handler プロパティにハンドラー関数を設定することができます。ハンドラー関数は、リクエストを受け取り、レスポンスを返す関数です。次の例では、/hello エンドポイントにリクエストが送信されたときに、handler プロパティに定義されたハンドラー関数が呼び出されます。
fastify.get('/hello3', function (request, reply) {
  reply.send({ hello: 'world3' })
})

// ✅✅✅✅✅✅✅Fastify では、ハンドラー関数が非同期関数である場合、
// Fastify はその関数が完了するまでレスポンスを保留します。
// このため、Fastify では、非同期関数の使用を推奨しています。
fastify.get('/hello4', async function (request, reply) {
  const result = await db.getOptions();
  reply.send(result)
})


// ✅✅✅✅✅✅✅スキーマバリデーション 
// Fastify は、リクエストとレスポンスのバリデーションをサポートしています。バリデーションを設定するには、schema プロパティを使用します。
// schema オブジェクトには、querystring、params、body、headers、response などのプロパティを定義できます。
// https://booming-weak-salamander.glitch.me//user2?name=abc&age=222
const schema = {
  querystring: {
    name: { type: 'string' },
    age: { type: 'integer' }
  }
}

fastify.get('/user2', { schema }, function (request, reply) {
  const { name, age } = request.query
  reply.send(`Hello, ${name}! You are ${age} years old.`)
})



/**
 * Admin endpoint to empty all logs
 *
 * Requires authorization (see setup instructions in README)
 * If auth fails, return a 401 and the log list
 * If auth is successful, empty the history
 */
fastify.post("/reset", async (request, reply) => {
  let params = request.query.raw ? {} : { seo: seo };

  /* 
  Authenticate the user request by checking against the env key variable
  - make sure we have a key in the env and body, and that they match
  */
  if (
    !request.body.key ||
    request.body.key.length < 1 ||
    !process.env.ADMIN_KEY ||
    request.body.key !== process.env.ADMIN_KEY
  ) {
    console.error("Auth fail");

    // Auth failed, return the log data plus a failed flag
    params.failed = "You entered invalid credentials!";

    // Get the log list
    params.optionHistory = await db.getLogs();
  } else {
    // We have a valid key and can clear the log
    params.optionHistory = await db.clearHistory();

    // Check for errors - method would return false value
    params.error = params.optionHistory ? null : data.errorMessage;
  }

  // Send a 401 if auth failed, 200 otherwise
  const status = params.failed ? 401 : 200;
  // Send an unauthorized status code if the user credentials failed
  return request.query.raw
    ? reply.status(status).send(params)
    : reply.status(status).view("/src/pages/admin.hbs", params);
});

// Run the server and report out to the logs
fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
  }
);
