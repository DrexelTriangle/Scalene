const MostRead = ({ articleList }) => {
    var mostReadArticles = []
    var num = 1
    articleList.map((article) => {
        // For some reason text-lg doesn't work
        mostReadArticles.push(
        <>
        <div className="grid grid-cols-8 my-1">
            <div className="text-[2rem] col-span-1 mx-auto">
                {num}
            </div>
            <div className="col-span-6 my-1">
            <div className="float-left">A Long Title that Means Nothing
                <div className="text-sm">Author | Date</div>
            </div>
            </div>
            </div>
        </>)   
        num += 1
    }
)
    return (
        <>
        Most Read
        <div className="divide-y divide-grey">
            {mostReadArticles}
        </div>
        </>
    )
}

export default MostRead