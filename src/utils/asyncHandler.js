/* promise based syntax
const asyncHandler = (reqHandler) => {
    (req, res, next) => {
        Promise.resolve(reqHandler(req, res, next))
        .catch((err) => next(err))
    }
} 
*/

const asyncHandler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next)
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message
        })
    }
}


export default asyncHandler 