'use strict'

const sum = list => list.reduce((a, b) => a + b, 0)
module.exports = {
  calc: values => {
    let itemIndex
    while (values.length > 2) {
      const avg = sum(values) / values.length
      const min = Math.min(...values)
      const max = Math.max(...values)
      if ((min + max) / 2 === avg) return avg
      let maxDeviation = 0
      values.forEach((value, i) => {
        const deviation = Math.abs(value - avg)
        if (deviation > maxDeviation) {
          maxDeviation = deviation
          itemIndex = i
        }
      })
      values.splice(itemIndex, 1)
    }
    return parseInt(sum(values) / values.length)
  }
}()
