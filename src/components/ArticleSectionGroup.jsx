import List from './List.jsx';

const ArticleSectionGroup = ({ sectionName, type }) => {
    sectionName = sectionName.toUpperCase()
    if (type == 1){
        var articleGroup = (<>
                <div className="col-span-5">
                <List showImage={true} showDescription={true}  articleList={["0"]}/>
                </div>
                <div className="col-span-3">
                <List showImage={true} articleList={["0", "1"]}/>
                </div>
                <div className="col-span-4">
                <List showSection={true} articleList={["SPORTS", "OPINION", "NEWS", "COMICS"]}/>
                </div>
            </>
        );
        return (
        <div>
            <hr className='border-blue-700'/>
            {sectionName}
            <div className="grid grid-cols-12 gap-1 m-1 divide-x divide-grey">
                {articleGroup}
            </div>
        </div>
    )
    }
    else if (type == 2){
        var articleGroup = (<>
                <div className="col-span-3">
                <List showImage={true} articleList={["0", "1"]}/>
                </div>
                <div className="col-span-5">
                <List showImage={true} showDescription={true}  articleList={["0"]}/>
                </div>
            </>
       );  
       return articleGroup  
    }

    
}

export default ArticleSectionGroup
