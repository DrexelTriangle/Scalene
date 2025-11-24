const Classifieds = () => {
    return(
    <div>
        {/*Containers header;
        To do: change donate font
        */}
        <div> 
            <h2 className="font-bold text-4xl text-center font-serif">Classifieds</h2>
        </div>


        {/* border & text with margins and color set */}
        <div className = "text-[16px] w-[90%] m-auto mb-[70px]"> 
            <hr className = "border-[#07294d] border-[3.1px] mb-[20px]"/>
            <div>
                <p className = "font-bold font-serif italic mb-[5px]">
                    Below are the currently listed classifieds for The Triangle. If you would like to submit a classified ad to The Triangle, please 
                    <a href = 'https://secure.touchnet.com/C20688_ustores/web/store_main.jsp?STOREID=67' className = "text-blue-800"> <u>click here.</u> </a>
                    Thank you.
                </p>

                <hr className = "mb-[30px] border-[#525151]"></hr>
                
                <p> 
                    Want your classified ad placed here? Contact our business manager: <a href = 'mailto:business@thetriangle.org' className = "text-blue-800"> <u>business@thetriangle.org</u> </a>
                </p>
            </div>
        </div>
    </div>
    )
}
export default Classifieds