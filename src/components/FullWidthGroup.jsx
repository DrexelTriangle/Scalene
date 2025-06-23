import List from './List.jsx';

const FullWidthGroup = ({ sectionName, type }) => {
    sectionName = sectionName.toUpperCase()
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
            <hr className='mx-2 border-blue-700'/>
            <div className="font-roboto-slab font-semibold px-2">
                {sectionName.toUpperCase()}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-1 m-1 divide-x divide-grey">
                {articleGroup}
            </div>
        </div>
    )
    }


export default FullWidthGroup
