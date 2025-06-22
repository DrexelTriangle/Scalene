import List from './List.jsx'; 

// The top article row of the front page
const TopArticle = () => {
    return(
        <div className="grid grid-cols-12 my-1 divide-x divide-grey">
            <div className="col-span-3">
            <List showImage={true} articleList={["SPORTS", "OPINION"]}/>
            </div>
            <div className="col-span-6">
            <List showImage={true} showDescription={true} articleList={["NEWS"]}/>
            </div>
            <div className="col-span-3">
            <List showSection={true} articleList={["SPORTS", "OPINION", "NEWS", "COMICS"]}/>
            </div>
        </div>
    )
}

export default TopArticle