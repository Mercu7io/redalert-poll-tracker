function validate({ body, params, query } = {}) {
    return (req, res, next) => {
        try {
            if (body) {
                const parsedBody = body.safeParse(req.body);
                if (!parsedBody.success) {
                    return res.status(400).json({
                        error: 'Validation Error',
                        details: parsedBody.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
                    });
                }
                req.body = parsedBody.data;
            }

            if (params) {
                const parsedParams = params.safeParse(req.params);
                if (!parsedParams.success) {
                    return res.status(400).json({
                        error: 'Param Validation Error',
                        details: parsedParams.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
                    });
                }
                req.params = parsedParams.data;
            }

            if (query) {
                const parsedQuery = query.safeParse(req.query);
                if (!parsedQuery.success) {
                    return res.status(400).json({
                        error: 'Query Validation Error',
                        details: parsedQuery.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
                    });
                }
                req.query = parsedQuery.data;
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { validate };

