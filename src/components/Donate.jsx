const Donate = () => {
    return(
    <div>
        {/*Containers header;
        To do: change donate font
        */}
        <div> 
            <h2 className="font-bold text-4xl text-center font-serif">Donate</h2>
        </div>

        {/* border & text with margins and color set */}
        <div className = "text-[20px] w-[90%] m-auto mb-[70px]"> 
            <hr className = "border-[#07294d] border-[3.1px] mb-[50px]"/>
            <div className = "leading-[25px]">
                <p> 
                    Thank you for considering a monetary donation to The Triangle. Contributions can be made through the Drexel Fund, 
                    <a href='http://www.giving.drexel.edu/TheTriangle' className = "text-blue-800"> linked here</a>. 
                    Navigating to the link will also allow you to see our campaign’s progress. 
                    <br/><br/>

                    Considering supporting The Triangle through the purchase of an advertisements? See our <a className = "text-blue-800" href='https://www.thetriangle.org/advertising-new/'>advertising page</a> for more information.
                    <br/><br/>

                    <u>On-line donation information:</u>
                    <br/><br/>

                    <a className = "text-blue-800" href='https://alumni.drexel.edu/s/1683/form/16/form.aspx?sid=1683&gid=2&pgid=476&content_id=106'><u>Alumni Online Community – Make a Gift (drexel.edu)</u></a>
                    <br/><br/>

                    From this page, in the “choose your designation” area select “Select Another Area to Support” and the Triangle is in the “Campus Life” section of that drop down box.
                    <br/><br/>

                    <u>The instructions for mailing a gift are here:</u>
                    <br/><br/>

                    <a className = "text-blue-800" href='https://giving.drexel.edu/ways-to-give/cash/'><u>Ways to Give Back: Cash Donations | Drexel University</u></a>
                    <br/><br/>

                    Please specify the Triangle in the “please direct my gift to:” section of the Pledge form here.
                    <br/><br/>
                </p>
            </div>
        </div>
        
    </div>

    

    )
}
export default Donate