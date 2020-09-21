import React, {Component} from "react";
import {validateBorrow} from "../../lib/Actions";

export default class Borrow extends Component {

    name = "Borrow";
    action = "borrow";
    actioning = "Borrowing";

    constructor(props) {
        super(props);

        this.state = {
            val : '',
            invalid : false,
            error: '',
        }
    }

    validate = async (val) => {
        const ok = await validateBorrow(val);

        let error = '';
        if (!ok[0]) error = ok[1];

        this.setState({invalid: !ok[0], error});
        return ok;
    };

    doAction = () => {
        const {val} = this.state;
        if (!val*1) return false;

        this.props.onPanelAction(this.action, val, this.actioning)
    };

    onChange = (e) => {
        const val = e.target.value;
        this.setState({val});
        this.props.onPanelInput(val);
        this.validate(val);
    };

    render() {

        const {invalid, error, val} = this.state;

        return (
            <div className="currency-action-panel">
                <h2>Borrow</h2>
                <p>How much DAI would you like to Borrow?</p>
                <div className="currency-input">
                    <div className="tooltip-container">
                        <input type="number" onChange={this.onChange} placeholder="Amount in DAI" />
                        {error &&
                        <div className="warning tooltip bottom">
                            <i> </i>
                            {error}
                        </div>}
                    </div>
                    <button className={invalid?'disabled':''} onClick={this.doAction}>{this.name}</button>
                </div>
            </div>
        )
    }
}