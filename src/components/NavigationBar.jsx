const NavigationBar = ({pageNames}) => {
    var pageButtons = []
    pageNames.map((pageName)=>{
        var pageButton = (
            <button>{pageName}</button>
        )
        pageButtons.push(
            <div className="font-roboto-slab font-semibold text-sm md:text-lg">
            {pageButton}
            </div>
        )
    })
    return (<div className="flex justify-around my-1 md:mx-[10rem]">
        {pageButtons}
        </div>);
}

export default NavigationBar 