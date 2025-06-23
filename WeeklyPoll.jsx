const WeeklyPoll = ({question, answers}) => {
    var answerButtons = []
    answers.map((answer) => {
        answerButtons.push(
            <div>
                answer
            </div>
        )
    })
    return (
        <>
        WEEKLY POLL
        <div> 
            {question}
        </div>
        {answerButtons}

        
        </>
    )
}


export default WeeklyPoll