const List = ({showSection, showImage, showDescription, articleList, isRow}) => {
    var articleListComponent = []

    articleList.map((articleName) =>
    {
        const sectionName = showSection ? `${articleName.toUpperCase()}` : ``
        const image = showImage ? <img className="aspect-4/3 object-cover" src={randomImage()} alt="Image goes here"/> : <></>
        const description = showDescription ? `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.` : ``

        articleListComponent.push(
        <>
        <div className="p-3">
            {image}  
            <div className='secondary-color-two font-roboto-slab text-sm mt-1 font-semibold'>
                {sectionName}
            </div>
            <div className={`font-playfair ${articleList.length == 1 ? "text-3xl" : "text-xl"}`}> {randomName()}
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

function randomName() {
    var names = [
        "Raise your spirits at the new Fine Wine", 
        "Students weigh in on DA Krasner’s likely third term",
        "Neurology meets theology with Dr. Ozdemir",
        "The Love Triangle: Making our stories up as we go"

    ] 
    const randomName = names[Math.floor(Math.random() * names.length)]
    return randomName
}

function randomImage() {
    var imgs = [
        "src\\assets\\drexel-campus-bridge.jpg", 
        "src\\assets\\jordan-fink.jpg",
        "src\\assets\\KaseyShamis-2.jpeg",
    ] 
    const randomImg = imgs[Math.floor(Math.random() * imgs.length)]
    return randomImg
}