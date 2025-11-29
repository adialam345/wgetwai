import { DataTypes } from "sequelize";
import { sequelize } from "../../config/Database.js";

const Message = sequelize.define(
	"Message",
	{
		session_name: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		message_id: {
			type: DataTypes.STRING,
			allowNull: false,
			unique: true,
		},
		remote_jid: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		from_me: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
		},
		message_data: {
			type: DataTypes.TEXT("long"),
			allowNull: false,
		},
	},
	{ tableName: "messages", timestamps: true }
);

export default Message;

