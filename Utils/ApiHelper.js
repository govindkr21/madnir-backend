const makeExternalCall = async (
  method,
  url,
  params = {},
  headers = { "Content-Type": "application/json" }
) => {
  let error = false;
  let data = {};
  let message = "";
  let status = 200;

  try {
    const isGetLike = method === "GET" || method === "DELETE";
    const response = await fetch(url, {
      method,
      headers,
      body: isGetLike ? undefined : JSON.stringify(params),
    });

    status = response.status;
    const body = await response.json();

    if (!response.ok) {
      error = true;
      message = body.message || "External request failed.";
    } else {
      data = body;
      message = body.message || "";
    }
  } catch (err) {
    error = true;
    message = err.message || "External network error.";
  }

  return { error, data, message, status };
};

module.exports = {
  makeExternalCall,
};
