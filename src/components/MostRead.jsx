const MostRead = ({ articleList }) => {
    var mostReadArticles = []
    var num = 1
    articleList.map((article) => {
        // For some reason text-lg doesn't work
        mostReadArticles.push(
            <>
                <div className="grid grid-cols-12 my-1">
                    <div className="text-[2rem] col-span-1 text-blue-700">
                        {num}
                    </div>
                    <div className="col-span-11 my-1">
                        <div className="float-left font-playfair">A Long Title that Means Nothing
                            <div className="text-xs font-roboto-slab my-1">Author | Date</div>
                        </div>
                    </div>
                </div>
            </>)
        num += 1
    }
    )
    return (
        <div className="mx-4">
            <div className="font-roboto-slab font-semibold">
                MOST READ
            </div>
            <div className="divide-y divide-grey">
                {mostReadArticles}
            </div>
        </div>
    )
}

export default MostRead