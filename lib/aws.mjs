// Lazy access to the AWS SDK.
//
// The SDK is an *optional* peer dependency (docs/adr/0001): the smoke path has to
// install with nothing at all, so `status` and `switch` cannot import it at the
// top of the module. Loading it here lets a missing SDK produce the install line
// instead of a module-resolution stack trace.

/** DynamoDB document-client pieces, or a clear exit if the SDK is not installed. */
export async function loadDynamo() {
  try {
    const [client, doc] = await Promise.all([
      import("@aws-sdk/client-dynamodb"),
      import("@aws-sdk/lib-dynamodb"),
    ]);
    return {
      DynamoDBClient: client.DynamoDBClient,
      DynamoDBDocumentClient: doc.DynamoDBDocumentClient,
      GetCommand: doc.GetCommand,
      UpdateCommand: doc.UpdateCommand,
    };
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
    console.error(
      "This command needs the AWS SDK, an optional peer dependency of @eldoggo/ops:\n" +
        "    npm i -D @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb\n" +
        "The smoke runner (ops-smoke) needs nothing and is unaffected.",
    );
    process.exit(2);
  }
}
