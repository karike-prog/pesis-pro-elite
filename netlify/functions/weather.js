exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "FMI Open Data",
      temperature: null,
      windSpeed: null,
      precipitation: null,
      windDirection: null,
      note: "Weather function test OK"
    })
  };
};
