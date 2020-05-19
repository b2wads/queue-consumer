module.exports = async (array, asyncCallback) => {
  return Promise.all(array.map(asyncCallback))
}
