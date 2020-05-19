module.exports = {
  errorParser: (err) => ({
    error: err.name,
    stack: err.stack.split('\n'),
    message: err.message || err.text,
  }),
}
