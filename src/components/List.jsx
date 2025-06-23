const List = ({showSection, showImage, showDescription, articleList, isRow}) => {
    var articleListComponent = []

    articleList.map((articleName) =>
    {
        const sectionName = showSection ? `${articleName.toUpperCase()}` : ``
        const image = showImage ? <img src="src\assets\drexel-campus-bridge.jpg" alt="Image goes here"/> : <></>
        const description = showDescription ? `This is a beautifully written description. It's non-existent, just like Drexel's financial management.` : ``

        articleListComponent.push(
        <>
        <div className="p-2">
            {image}  
            <div className='secondary-color-two'>
                {sectionName}
            </div>
            <div className="">A Long Title that Means Nothing</div>
            <div className="text-sm">Author | Date</div>
            {description}
        </div>
        </>
            )
    }
    )

    if (isRow){
        return(
            <>
            <div className="grid grid-cols-1 md:grid-cols-4 divide-x divide-gray">
                {articleListComponent}
            </div>
            </>
        )
    }

    return(
        <>
        <div className="divide-y divide-gray divide-solid">
            {articleListComponent}
        </div>
        </>
    )
}

export default List


