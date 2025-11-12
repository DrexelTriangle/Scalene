const NavigationBar = ({pageNames}) => {
    var pageButtons = []
    pageNames.map((pageName)=>{
        var pageButton = (
            <button>{pageName}</button>
        )
        pageButtons.push(
            <a>
            {pageButton}
            </a>
        )
    })
    return (
    <nav className="flex justify-center w-[100%] font-roboto-slab font-semibold text-base gap-[5%] py-[10px]">
        {pageButtons}
    </nav>);
}

export default NavigationBar 