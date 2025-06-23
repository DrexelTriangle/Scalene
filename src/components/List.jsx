const List = ({showSection, showImage, showDescription, articleList, isRow}) => {
    var articleListComponent = []

    articleList.map((articleName) =>
    {
        const sectionName = showSection ? `${articleName.toUpperCase()}` : ``
        const image = showImage ? <img className="aspect-4/3 object-cover" src="src\assets\drexel-campus-bridge.jpg" alt="Image goes here"/> : <></>
        const description = showDescription ? `This is a beautifully written description. It's non-existent, just like Drexel's financial management.` : ``
        const title = randomListName()

        articleListComponent.push(
        <>
        <div className="p-2">
            {image}  
            <div className='secondary-color-two font-roboto-slab text-sm mt-1 font-semibold'>
                {sectionName}
            </div>
            <div className={`font-playfair ${articleList.length == 1 ? "text-3xl" : "text-xl"}`}> {title}
</div>
            <div className="text-xs font-roboto-slab my-1">Author | Date</div>
            <p className="">{description}</p>
        </div>
        </>
            )
    }
    )

        return(
            <>
            <div className={`${isRow ? "grid grid-cols-1 md:grid-cols-4 divide-x" : "divide-y divide-gray divide-solid"} divide-gray`}>
                {articleListComponent}
            </div>
            </>
        )
}

export default List

function randomListName() {
    var names = [
        "Raise your spirits at the new Fine Wine", 
        "Students weigh in on DA Krasner’s likely third term",
        "Neurology meets theology with Dr. Ozdemir",
        "The Love Triangle: Making our stories up as we go"

    ] 
    const randomName = names[Math.floor(Math.random() * names.length)]
    return randomName
}