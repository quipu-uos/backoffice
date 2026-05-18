exports.isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()){ //passport를 통해 로그인 안했는지
        next();
    } else {
        res.status(401).json({ error: { message: "UNAUTHORIZED" } });
    }
};
exports.isNotLoggedin = (req, res, next) => {
    if (!req.isAuthenticated()){ 
        next();
    }   else{
        res.status(403).send('로그인한 상태입니다.')
    }
}