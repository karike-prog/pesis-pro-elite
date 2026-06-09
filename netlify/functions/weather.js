exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "FMI Open Data",
      note: "Weather function test OK"
    })
  };
};
