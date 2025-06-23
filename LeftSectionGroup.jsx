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
                <div className="col-span-4">
                    {sideList}
                </div>
            </>
        )
    }


    return (
        <>
        {sectionName.toUpperCase()}
        <div className="grid grid-cols-8 divide-x divide-grey">
            {sectionGroup}
        </div>
        </>
    )
}

export default LeftSectionGroup