import List from "./src/components/List"

const LeftSectionGroup = ({ sectionName, type, isReverse, list1, list2 }) => {
    // The Lists are supposed to be passed in later as arguments
    // Columns span will be fetched from 'type' argument
    if (type === "5-3") {
        var sectionGroup = (
            <>
                <div className={`col-span-5 ${isReverse ? "order-last" : ""}`}>
                    <List showImage={true} showDescription={true} articleList={["0"]} />
                </div>

                <div className="col-span-3">
                    <List showImage={true} articleList={["0", "1"]} />
                </div>
            </>
        )
    }

    else if (type === "4-4") {
        var sideList = (
            isReverse ? <List showSection={true} articleList={["SPORTS", "OPINION", "NEWS", "COMICS"]} /> : <List showImage={true} articleList={["0", "1"]}/>
        )

        var sectionGroup = (
            <>
                <div className="col-span-4">
                    <List showImage={true} showDescription={true} articleList={["0"]} />
                </div>
                <div className={`col-span-${isReverse ? "4" : "3"}`}>
                    {sideList}
                </div>
            </>
        )
    }


    // I still haven't figured out to make this thing responsive lol, I think the issue is it's nested inside a col-span-8
    return (
        <div>
            <div className="font-roboto-slab font-semibold px-2">
                {sectionName.toUpperCase()}
            </div>
            <div className="grid grid-cols-8 divide-x divide-grey">
                {sectionGroup}
            </div>
        </div>
    )
}

export default LeftSectionGroup